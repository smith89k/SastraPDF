# The release job's R2 helpers (sourced by .github/workflows/release.yml; they need R2_BUCKET, R2_ENDPOINT and the
# AWS_* key in the environment). The same as Bohpum's.

# put <file> <key> [aws s3 cp options…]: upload a file to the R2 bucket, then check the bucket holds all of it.
put() {
  local f="$1" key="$2"; shift 2
  aws s3 cp "$f" "s3://$R2_BUCKET/$key" --endpoint-url "$R2_ENDPOINT" --only-show-errors "$@"
  local want got
  want="$(stat -c %s "$f")"
  got="$(aws s3api head-object --bucket "$R2_BUCKET" --key "$key" --endpoint-url "$R2_ENDPOINT" --query ContentLength --output text | tr -d '\r')"
  if [ "$got" != "$want" ]; then echo "::error::$key in R2 is $got bytes, not $want"; exit 1; fi
  echo "Uploaded $key ($got bytes)"
}

# r2_has <key>: 0 when the bucket has it, 1 when R2 answers "Not Found" (404). Any other answer — no connection, a
# refusal, a server error — stops the job: guessing "not there" could build again and put different bytes under a name
# that installed copies may already have checked.
r2_has() {
  local err
  if err="$(aws s3api head-object --bucket "$R2_BUCKET" --key "$1" --endpoint-url "$R2_ENDPOINT" 2>&1 >/dev/null)"; then return 0; fi
  if grep -qE '\(404\)|Not Found' <<< "$err"; then return 1; fi
  echo "::error::Couldn't tell whether $1 is in R2, so the release stopped rather than guess: $err"
  exit 1
}
