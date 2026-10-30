#!/usr/bin/env bash
# API scenario from docs/DEMO.md. Run against a started site: bash scripts/demo.sh
# Needs curl and jq. BASE can be overridden: env BASE=http://127.0.0.1:3000 bash scripts/demo.sh
set -u
BASE="${BASE:-http://127.0.0.1:3000}/api/v1"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
STEP="start"
STATUS=""
BODY=""
IDEM=""

fail() {
  echo "FAIL [$STEP]: $*" >&2
  echo "  status=$STATUS body=$(printf '%s' "$BODY" | head -c 400)" >&2
  exit 1
}

# call METHOD PATH TOKEN [JSON]
call() {
  local m="$1" p="$2" t="${3-}" b="${4-}"
  local args=(-s -o "$TMP" -w '%{http_code}' -X "$m" "$BASE$p")
  [ -n "$t" ] && args+=(-H "Authorization: Bearer $t")
  [ -n "$b" ] && args+=(-H 'Content-Type: application/json' -d "$b")
  [ -n "$IDEM" ] && args+=(-H "Idempotency-Key: $IDEM")
  STATUS="$(curl "${args[@]}")"
  BODY="$(cat "$TMP")"
}

step() { STEP="$1"; echo "- $1"; }
status_is() { [ "$STATUS" = "$1" ] || fail "expected HTTP $1"; }
jq_is() { # jq expression must be true
  printf '%s' "$BODY" | jq -e "$1" >/dev/null 2>&1 || fail "expected: $1"
}
val() { printf '%s' "$BODY" | jq -r "$1"; }

# poll PATH TOKEN JQ_EXPR  (up to 15 s)
poll() {
  local i
  for i in $(seq 1 60); do
    call GET "$1" "$2"
    if [ "$STATUS" = 200 ] && printf '%s' "$BODY" | jq -e "$3" >/dev/null 2>&1; then return 0; fi
    sleep 0.25
  done
  fail "poll timed out: $3"
}

login() { # JSON -> token
  call POST /dev/login "" "$1"
  status_is 200
  val .token
}

step "1. reset and three logins"
call POST /dev/reset ""; status_is 200
RES="$(login '{"username":"anna"}')"
STAFF="$(login '{"username":"staff-ivan"}')"
REV="$(login '{"role":"REVIEWER"}')"
[ -n "$RES" ] && [ -n "$STAFF" ] && [ -n "$REV" ] || fail "no tokens"
call POST /dev/login "" '{"username":"staff-ivan"}'; jq_is '.role == "STAFF"'

step "2. resident submits a request"
call POST /dev/files "$RES" '{"name":"photo.jpg","mediaType":"image/jpeg","sizeBytes":2048}'; status_is 201
FILE="$(val .fileId)"
IDEM="demo-key-$(date +%s)-$RANDOM"
BODYREQ="{\"description\":\"Протечка кровли над подъездом\",\"entrance\":\"2\",\"photoFileIds\":[\"$FILE\"]}"
call POST /requests "$RES" "$BODYREQ"; status_is 201
jq_is '.status == "ACCEPTED"'
REQ="$(val .id)"

step "3. repeated request with the same key"
call POST /requests "$RES" "$BODYREQ"; status_is 201
[ "$(val .id)" = "$REQ" ] || fail "idempotency: id changed"
IDEM=""

step "4. staff sees the request in the list"
call GET /requests "$STAFF"; status_is 200
jq_is ".items | map(.id) | index(\"$REQ\") != null"

step "5. staff opens the request, waits for the AI draft"
call GET "/requests/$REQ" "$STAFF"; status_is 200
poll "/requests/$REQ" "$STAFF" '.steps | map(select(.step=="TRIAGE" and .state=="DRAFT_READY")) | length == 1'
jq_is '.status == "IN_PROGRESS"'

step "6. triage confirmation"
call GET "/requests/$REQ/triage" "$STAFF"; status_is 200
jq_is '.proposal.route == "PLANNED_PROCUREMENT"'
PROPOSAL="$(printf '%s' "$BODY" | jq -c .proposal)"
call POST "/requests/$REQ/triage/confirm" "$STAFF" "$PROPOSAL"; status_is 200
jq_is '.state == "APPROVED" and .confirmed != null and .confirmedBy.userId == "staff-ivan"'

step "7. staff edits the TZ"
call GET "/requests/$REQ/tz" "$STAFF"; status_is 200
jq_is '.version == 1 and .origin == "AI" and (.sections | length == 7) and (.openQuestions | length == 2)'
call PUT "/requests/$REQ/tz" "$STAFF" '{"baseVersion":1,"sections":[{"id":"s2","text":"ДЕМО. Правка сотрудника: объём 30 м²."}],"answers":[{"questionId":"q1","answer":"30"},{"questionId":"q2","answer":"битум"}]}'
status_is 200
jq_is '.version == 2 and .origin == "STAFF" and (.sections | map(select(.id=="s2"))[0].editedByStaff == true)'

step "8. stale baseVersion"
call PUT "/requests/$REQ/tz" "$STAFF" '{"baseVersion":1,"answers":[]}'
status_is 409; jq_is '.code == "STALE_VERSION"'

step "9. submit the TZ for review"
call POST "/requests/$REQ/tz/submit" "$STAFF" '{"version":2}'; status_is 201
jq_is '.state == "PENDING" and .subjectType == "TZ" and .subjectVersion == 2'

step "10. reviewer: queue, details, reject without a comment"
call GET "/approvals?state=PENDING" "$REV"; status_is 200
AP="$(printf '%s' "$BODY" | jq -r --arg r "$REQ" '.items | map(select(.requestId==$r))[0].id')"
[ -n "$AP" ] && [ "$AP" != null ] || fail "approval not in queue"
call GET "/approvals/$AP" "$REV"; status_is 200
jq_is '.subject.version == 2'
call POST "/approvals/$AP/reject" "$REV" '{"subjectVersion":2}'; status_is 400
call POST "/approvals/$AP/reject" "$REV" '{"subjectVersion":2,"comment":"   "}'; status_is 400

step "11. reject with a comment"
call POST "/approvals/$AP/reject" "$REV" '{"subjectVersion":2,"comment":"Уточните срок и приёмку"}'; status_is 200
jq_is '.state == "REJECTED"'

step "12. AI revises the TZ (version 3)"
poll "/requests/$REQ/tz" "$STAFF" '.version == 3 and .origin == "AI" and .lastReviewComment == "Уточните срок и приёмку" and .state == "DRAFT_READY"'
jq_is '(.openQuestions | map(.answer) | index("30") != null)'

step "13. resubmit version 3"
call POST "/requests/$REQ/tz/submit" "$STAFF" '{"version":3}'; status_is 201
AP="$(val .id)"

step "14. approve the TZ"
call POST "/approvals/$AP/approve" "$REV" '{"subjectVersion":3}'; status_is 200
call GET "/requests/$REQ" "$STAFF"; jq_is '.steps | map(select(.step=="TZ"))[0].state == "APPROVED"'

step "15. contractors and the quote request letter"
call GET /dev/contractors "$STAFF"; status_is 200
CIDS="$(printf '%s' "$BODY" | jq -c '[.items[].id]')"
jq_is '.items | length == 3'
call POST "/requests/$REQ/quote-requests" "$STAFF" "{\"contractorIds\":$CIDS}"; status_is 201
jq_is '(.recipients | length == 3) and (.attachments | length == 2) and (.subject | contains("ДЕМО"))'

step "16. three quotes, wait for extraction"
for n in 1 2 3; do
  call POST /dev/files "$STAFF" "{\"name\":\"kp-$n.pdf\",\"mediaType\":\"application/pdf\",\"sizeBytes\":4096}"; status_is 201
  QF="$(val .fileId)"
  call POST "/requests/$REQ/quotes" "$STAFF" "{\"fileIds\":[\"$QF\"]}"; status_is 202
  jq_is '.extraction == "EXTRACTING"'
done
poll "/requests/$REQ" "$STAFF" '.steps | map(select(.step=="QUOTES_NMC" and .state=="DRAFT_READY")) | length == 1'
call GET "/requests/$REQ/quotes" "$STAFF"; status_is 200
jq_is '(.items | length == 3) and (.items | all(.extraction == "EXTRACTED"))'
Q1="$(val '.items[0].id')"; Q3="$(val '.items[2].id')"

step "17. comparison flags"
call GET "/requests/$REQ/quotes/comparison" "$STAFF"; status_is 200
printf '%s' "$BODY" | jq -e --arg q "$Q3" '
  (.rows[] | select(.name == "Вывоз мусора (ДЕМО)") | .cells[] | select(.quoteId == $q) | .flag) == "MISSING"
  and ((.rows[] | select(.name == "Материалы (ДЕМО)") | .cells[] | select(.quoteId == $q) | .flag) == "OUTLIER")
  and (.discrepancies | length == 2)' >/dev/null || fail "flags MISSING/OUTLIER for quote 3"

step "18. staff corrects quote 3"
call GET "/requests/$REQ/quotes" "$STAFF"
Q3DATA="$(printf '%s' "$BODY" | jq -c '.items[2].data | .termsDays = 20')"
call PUT "/requests/$REQ/quotes/$Q3/data" "$STAFF" "{\"baseVersion\":1,\"data\":$Q3DATA}"; status_is 200
jq_is '.editedByStaff == true and .version == 2 and .data.termsDays == 20'

step "19. NMC calculation and submission"
call POST "/requests/$REQ/nmc/calculate" "$STAFF" '{}'; status_is 200
jq_is '.version == 1 and .method == "average_of_quotes" and .amount.amount == "60000.00" and .amount.currency == "RUB"'
call POST "/requests/$REQ/nmc/submit" "$STAFF" '{"version":1}'; status_is 201
jq_is '.subjectType == "NMC"'
AP="$(val .id)"

step "20. approve the NMC"
call POST "/approvals/$AP/approve" "$REV" '{"subjectVersion":1}'; status_is 200
call GET "/requests/$REQ" "$STAFF"
jq_is '(.steps | map(select(.step=="QUOTES_NMC"))[0].state == "APPROVED") and (.steps | map(select(.step=="TENDER"))[0].state | IN("PROCESSING","DRAFT_READY"))'

step "21. tender documents from AI"
poll "/requests/$REQ/tender" "$STAFF" '.state == "DRAFT_READY" and .winnerProposal != null and (.documents | length == 2)'
[ "$(val .winnerProposal.quoteId)" = "$Q1" ] || fail "AI proposed not quote 1"

step "22. select the proposed winner (standard contract)"
call PUT "/requests/$REQ/tender/winner" "$STAFF" "{\"quoteId\":\"$Q1\"}"; status_is 200
jq_is '.contract.type == "STANDARD" and (.contract.lawyerNotes | length == 0)'

step "23. package and submission"
call GET "/requests/$REQ/package" "$STAFF"; status_is 200
jq_is '.version == 1 and (.documents | length == 4)'
call POST "/requests/$REQ/package/submit" "$STAFF" '{"version":1}'; status_is 201
jq_is '.subjectType == "PACKAGE"'
AP="$(val .id)"

step "24. reject the package"
call POST "/approvals/$AP/reject" "$REV" '{"subjectVersion":1,"comment":"Выберите другого победителя"}'; status_is 200
call GET "/requests/$REQ" "$STAFF"
jq_is '(.steps | map(select(.step=="PACKAGE"))[0].state == "NEEDS_REWORK") and (.steps | map(select(.step=="TENDER"))[0].state == "NEEDS_REWORK")'

step "25. another winner: non-standard contract, package version 2"
call PUT "/requests/$REQ/tender/winner" "$STAFF" "{\"quoteId\":\"$Q3\",\"comment\":\"Другой победитель\"}"; status_is 200
jq_is '.contract.type == "NON_STANDARD" and (.contract.lawyerNotes | length == 2)'
call GET "/requests/$REQ/package" "$STAFF"; jq_is '.version == 2 and (.documents | length == 4) and .lastReviewComment == "Выберите другого победителя"'

step "26. submit package version 2"
call POST "/requests/$REQ/package/submit" "$STAFF" '{"version":2}'; status_is 201
AP="$(val .id)"

step "27. approve the package"
call POST "/approvals/$AP/approve" "$REV" '{"subjectVersion":2}'; status_is 200
call GET "/requests/$REQ" "$STAFF"
jq_is '.status == "COMPLETED" and (.steps | all(.state == "APPROVED"))'
call GET "/requests/$REQ/package" "$STAFF"; jq_is '.approvedAt != null'

step "28. resident sees COMPLETED without internals"
call GET "/requests/$REQ" "$RES"; status_is 200
jq_is '.status == "COMPLETED" and (has("steps") | not) and (has("author") | not) and (has("urgency") | not)'

step "29. approval journal"
call GET "/approval-journal?requestId=$REQ" "$REV"; status_is 200
jq_is '(.items | length == 5) and ([.items[].decision] | sort == ["APPROVED","APPROVED","APPROVED","REJECTED","REJECTED"])'

step "30. event log"
call GET "/dev/events?limit=500" "$STAFF"; status_is 200
jq_is '(.items | map(.topic) | unique) == ["ai.jobs","ai.results","notifications"]'

step "31. package zip and photo content"
ZIP="$(mktemp)"
curl -s -o "$ZIP" -w '%{http_code}' -H "Authorization: Bearer $STAFF" "$BASE/dev/package/$REQ/zip" | grep -q 200 || fail "zip status"
[ "$(head -c 2 "$ZIP")" = "PK" ] || fail "zip signature"
if command -v unzip >/dev/null; then [ "$(unzip -Z1 "$ZIP" | wc -l)" = 4 ] || fail "zip must hold 4 documents"; fi
rm -f "$ZIP"
PHOTO="$(mktemp)"; printf '\x89PNG\r\n\x1a\nDEMO' > "$PHOTO"
PID="$(curl -s -H "Authorization: Bearer $RES" -F "file=@$PHOTO;type=image/png;filename=p.png" "$BASE/dev/files" | jq -r .fileId)"
[ "$(curl -s -H "Authorization: Bearer $RES" "$BASE/dev/files/$PID/download" | head -c 4 | tail -c 3)" = "PNG" ] || fail "photo content is not returned"
rm -f "$PHOTO"
call GET "/dev/package/$REQ/zip" "$RES"; status_is 403

echo "- error checks"
step "E1. no token"
call GET /requests ""; status_is 401
step "E2. resident cannot approve"
call POST "/approvals/$AP/approve" "$RES" '{"subjectVersion":2}'; status_is 403
step "E3. other organization"
OTHER="$(login '{"username":"staff-other","orgId":"other-org"}')"
call GET "/requests/$REQ" "$OTHER"; status_is 404
step "E4. other resident of the same organization"
RES2="$(login '{"username":"boris"}')"
call GET "/requests/$REQ" "$RES2"; status_is 404
step "E5. repeated TZ submit"
call POST "/requests/$REQ/tz/submit" "$STAFF" '{"version":3}'; status_is 409
jq_is '.code == "STEP_NOT_ALLOWED"'
step "E6. no Idempotency-Key"
call POST /requests "$RES" "$BODYREQ"; status_is 400

echo "- mini-scenario: AI failure"
step "F1. request with [fail]"
IDEM="demo-fail-$RANDOM$RANDOM"
call POST /requests "$RES" "{\"description\":\"Течёт крыша [fail]\",\"entrance\":\"1\",\"photoFileIds\":[\"$FILE\"]}"; status_is 201
IDEM=""
FREQ="$(val .id)"
poll "/requests/$FREQ" "$STAFF" '.steps | map(select(.step=="TRIAGE" and .state=="AI_FAILED")) | length == 1'
jq_is '.steps | map(select(.step=="TZ"))[0].state == "AI_FAILED"'
step "F2. restart"
call POST "/requests/$FREQ/steps/TRIAGE/restart" "$STAFF"; status_is 202
poll "/requests/$FREQ" "$STAFF" '.steps | map(select(.step=="TRIAGE" and .state=="DRAFT_READY")) | length == 1'

echo "- mini-scenario: emergency"
step "G1. emergency request"
IDEM="demo-emerg-$RANDOM$RANDOM"
call POST /requests "$RES" "{\"description\":\"Прорыв трубы, затопило подъезд\",\"entrance\":\"3\",\"photoFileIds\":[\"$FILE\"]}"; status_is 201
IDEM=""
EREQ="$(val .id)"
poll "/requests/$EREQ/triage" "$STAFF" '.state == "DRAFT_READY"'
jq_is '.proposal.urgency == "EMERGENCY" and .proposal.route == "EMERGENCY_CONTRACTOR_CALL"'
step "G2. urgent notification and list order"
call GET "/dev/events?requestId=$EREQ&topic=notifications" "$STAFF"
jq_is '.items | map(select(.payload.to == "STAFF" and .payload.urgent == true)) | length >= 1'
call GET /requests "$STAFF"; status_is 200
[ "$(val '.items[0].id')" = "$EREQ" ] || fail "emergency request is not first"

echo "DEMO OK"
