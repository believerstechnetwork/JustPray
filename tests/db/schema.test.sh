#!/usr/bin/env bash
# Database tests: runs supabase/schema.sql against a real PostgreSQL, the way Supabase's SQL Editor
# does (the whole file as one simple query, so one transaction), and checks the import, send and
# rerun rules that only the database can show.
#
#   npm run test:db
#
# Connects with the usual libpq settings (PGHOST, PGPORT, PGUSER, PGPASSWORD) and creates, then
# drops, a scratch database (JP_TEST_DB, default jp_schema_test); JP_SCHEMA tests another file.
# Never point it at a server you care about: it only touches the scratch database, but it needs
# rights to create one.
set -uo pipefail

cd "$(dirname "$0")/../.."
SCHEMA=${JP_SCHEMA:-supabase/schema.sql}
DB=${JP_TEST_DB:-jp_schema_test}
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
failures=0
passes=0

admin() { psql -X -q -v ON_ERROR_STOP=1 -d postgres "$@"; }
q() { psql -X -qAt -d "$DB" "$@"; }
# Run a schema file as one simple query. Prints the error (if any); returns psql's exit code.
schema() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c "$(cat "$1")" 2>&1 >/dev/null | grep -v NOTICE; return "${PIPESTATUS[0]}"; }
ms() { echo $(($(date +%s%N) / 1000000)); }

check() { # name, actual, expected
  if [ "$2" = "$3" ]; then
    passes=$((passes + 1)); echo "  ok   $1"
  else
    failures=$((failures + 1)); echo "  FAIL $1"; echo "       expected: $3"; echo "       actual:   $2"
  fi
}
check_match() { # name, actual, extended regex
  if [[ "$2" =~ $3 ]]; then
    passes=$((passes + 1)); echo "  ok   $1"
  else
    failures=$((failures + 1)); echo "  FAIL $1"; echo "       expected to match: $3"; echo "       actual: $2"
  fi
}
check_lt() { # name, actual, limit
  if [ "$2" -lt "$3" ]; then
    passes=$((passes + 1)); echo "  ok   $1 ($2 < $3)"
  else
    failures=$((failures + 1)); echo "  FAIL $1: $2 is not below $3"
  fi
}

fresh_db() {
  admin -c "drop database if exists $DB" -c "create database $DB" >/dev/null
  # The roles Supabase has, which the schema grants to and revokes from.
  for role in anon authenticated service_role; do
    admin -c "do \$\$ begin create role $role; exception when duplicate_object then null; end \$\$;" >/dev/null
  done
}

# A published announcement with two imported people, one of whose emails a live run has claimed
# and started sending. Prints "<send id> <claim token>".
start_send() {
  q -c "insert into announcements (title, date, summary, subject, message)
        values ('T', '2027-01-01', 's', 'sub', 'm')" >/dev/null
  local id; id=$(q -c "select max(id) from announcements")
  q -c "select from import_contacts('[{\"name\":\"A\",\"email\":\"s$id-a@example.com\"},
        {\"name\":\"B\",\"email\":\"s$id-b@example.com\"}]'::jsonb, 'L')" >/dev/null
  q -c "select from publish_announcement($id, 'imported')" >/dev/null
  local token; token=$(q -c "select claim_token from claim_announcement_sends(1, 1000)" | head -1)
  local send; send=$(q -c "select id from announcement_sends where claim_token = '$token'")
  q -c "select begin_announcement_send($send, '$token')" >/dev/null
  echo "$send $token"
}
# Close every open send, so the next case starts with nothing in flight.
settle() { q -c "update announcement_sends set status = 'sent', claim_token = null
                 where status in ('claimed', 'sending')" >/dev/null; }

import() { # people json, key ('' for none) -> added|existing|unsubscribed
  if [ -n "$2" ]; then q -c "select * from import_contacts('$1'::jsonb, 'L', '$2')"
  else q -c "select * from import_contacts('$1'::jsonb, 'L')"; fi
}

echo "Schema"
fresh_db
if git rev-parse -q --verify origin/main >/dev/null 2>&1 && git show origin/main:$SCHEMA >/tmp/jp-main-schema.$$ 2>/dev/null; then
  schema /tmp/jp-main-schema.$$; check "the live (main) schema installs" "$?" 0
  rm -f /tmp/jp-main-schema.$$
fi
schema $SCHEMA; check "installs (or upgrades the live one)" "$?" 0
schema $SCHEMA; check "runs again with no change" "$?" 0
schema $SCHEMA; check "and again" "$?" 0

echo "Rerun while a send is in flight"
read -r send token < <(start_send)
out=$(schema $SCHEMA); code=$?
check "stops" "$code" 1
check_match "says why" "$out" "being sent right now, so nothing was changed"
t=$(ms); q -c "set lock_timeout = '1s'; select finish_announcement_send($send, '$token', 'sent')" >/dev/null
check "the send then finishes" "$?" 0
check_lt "without waiting (ms)" $(($(ms) - t)) 1000
check "and is marked sent" "$(q -c "select status from announcement_sends where id = $send")" sent

echo "Rerun with a fresh claim, then with one left by a run that died"
q -c "select from claim_announcement_sends(1, 1000)" >/dev/null
out=$(schema $SCHEMA); check "a claim from just now stops it" "$?" 1
q -c "update announcement_sends set claimed_at = now() - interval '3 minutes' where status = 'claimed'"
schema $SCHEMA; check "a claim 3 minutes old does not" "$?" 0
settle

echo "Rerun while another session holds announcements (the send must not wait behind it)"
read -r send token < <(start_send)
(q -c "begin; select count(*) from announcements; select pg_sleep(8); commit;" >/dev/null) &
holder=$!
sleep 0.5
tmp=$(mktemp)
(t0=$(ms); schema $SCHEMA >"$tmp.out"; echo "$? $(($(ms) - t0))" >"$tmp") &
script=$!
sleep 1.5
t=$(ms); q -c "set lock_timeout = '1s'; select finish_announcement_send($send, '$token', 'sent')" >/dev/null
check "the send finishes while the rerun is retrying" "$?" 0
check_lt "without waiting (ms)" $(($(ms) - t)) 1000
wait $script; read -r code took <"$tmp"
check "the rerun stops, changing nothing" "$code" 1
check_match "says the tables are busy" "$(cat "$tmp.out")" "tables are busy right now"
check_lt "after about five seconds (ms)" "$took" 7000
wait $holder; rm -f "$tmp" "$tmp.out"

echo "Rerun while an import is saving"
(q -c "begin; select from import_contacts('[{\"name\":\"Z\",\"email\":\"z@example.com\"}]'::jsonb, 'L', 'key-zzzzzzzzzzzzzzzz');
       select pg_sleep(2); commit;" >/dev/null) &
importer=$!
sleep 0.5
schema $SCHEMA; check "waits for it, then runs" "$?" 0
wait $importer

echo "Import counts"
J='[{"name":"A","email":"u1@example.com"},{"name":"B","email":"u2@example.com"},{"name":"C","email":"u3@example.com"}]'
check "an earlier import adds u1" "$(import '[{"name":"A","email":"u1@example.com"}]' key-earlier000000000)" "1|0|0"
check "a batch: u2, u3 added, u1 already on the list (reply lost)" "$(import "$J" key-uuuuuuuuuuuuuuuu)" "2|1|0"
q -c "insert into unsubscribes (email) values ('u1@example.com'), ('u2@example.com')"
check "the retry, after u1 and u2 unsubscribe, gets the first result back" "$(import "$J" key-uuuuuuuuuuuuuuuu)" "2|1|0"
check "another import of the same people sees them as they are now" "$(import "$J" key-vvvvvvvvvvvvvvvv)" "0|1|2"
check "so does one without a key" "$(import "$J" '')" "0|1|2"
check "an unsubscribed newcomer is left off" \
  "$(q -c "insert into unsubscribes (email) values ('n9@example.com')"; import '[{"name":"N","email":"n9@example.com"},{"name":"M","email":"m9@example.com"}]' key-nnnnnnnnnnnnnnnn)" "1|0|1"
check "and never gets a contact row" "$(q -c "select count(*) from contacts where email = 'n9@example.com'")" 0

echo "Import retries that overlap the first try"
J2='[{"name":"X","email":"c1@example.com"},{"name":"Y","email":"c2@example.com"}]'
(q -c "begin; select from import_contacts('$J2'::jsonb, 'L', 'key-cccccccccccccccc'); select pg_sleep(2); commit;" >/dev/null) &
first=$!
sleep 0.7
check "a retry during a first try that commits waits and gets its result" "$(import "$J2" key-cccccccccccccccc)" "2|0|0"
wait $first
J3='[{"name":"R","email":"r1@example.com"}]'
(q -c "begin; select from import_contacts('$J3'::jsonb, 'L', 'key-rrrrrrrrrrrrrrrr'); select pg_sleep(2); rollback;" >/dev/null) &
first=$!
sleep 0.7
check "a retry during a first try that rolls back does the work" "$(import "$J3" key-rrrrrrrrrrrrrrrr)" "1|0|0"
wait $first
check "once" "$(q -c "select count(*) from contacts where email = 'r1@example.com'")" 1

echo "Import results are kept for 7 days (the page resumes within 1)"
J4='[{"name":"E","email":"e1@example.com"},{"name":"F","email":"e2@example.com"}]'
K4=key-eeeeeeeeeeeeeeee
check "first try (reply lost)" "$(import "$J4" $K4)" "2|0|0"
q -c "update import_batches set created_at = now() - interval '6 days' where import_key = '$K4'"
check "a retry 6 days later gets the first result" "$(import "$J4" $K4)" "2|0|0"
q -c "update import_batches set created_at = now() - interval '8 days' where import_key = '$K4'"
check "8 days later the result has expired, so a retry recounts" "$(import "$J4" $K4)" "0|2|0"
check "the expired result was removed and a fresh one stored" \
  "$(q -c "select count(*) from import_batches where import_key = '$K4' and created_at > now() - interval '1 hour'")" 1

admin -c "drop database if exists $DB" >/dev/null
echo
echo "$passes passed, $failures failed"
[ "$failures" -eq 0 ]
