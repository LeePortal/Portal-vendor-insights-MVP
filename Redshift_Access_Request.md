# Request to data / AWS team — read-only Redshift access for the vendor reporting API

We're deploying a small **read-only** reporting API (hosted on Vercel) that runs SQL
queries against our Redshift warehouse using the **AWS Redshift Data API**. To connect it,
please provide the following. Everything will be stored in Vercel's encrypted environment
variables — never in client/browser code. No data leaves our AWS account except the
aggregated query results returned to the logged-in user.

## Needed to make the first live connection

1. **AWS region** of the Redshift cluster/workgroup (e.g. `us-east-1`).

2. **Redshift connection details:**
   - If Redshift **Serverless**: the **Workgroup name**.
   - If a **provisioned cluster**: the **Cluster identifier**.
   - The **Database name** to query.

3. **A read-only database user, exposed as an AWS Secrets Manager secret** — please send the
   **Secret ARN**. (The Redshift Data API uses this secret to log in to the database.) The
   user needs **SELECT-only** access to the reporting schema/table(s) — no write access.

4. **AWS credentials for the app to call AWS** — an IAM user **Access Key ID + Secret Access
   Key** whose policy allows:
   - `redshift-data:ExecuteStatement`, `redshift-data:DescribeStatement`, `redshift-data:GetStatementResult`
   - `secretsmanager:GetSecretValue` on the secret in #3

   *(If you'd rather not issue long-lived access keys to an outside host, tell us — we can
   instead run this piece inside our own AWS account on Lambda. Let us know your preference.)*

5. **The exact schema-qualified table** for the proposal line-item data we report on. We've
   been assuming `analytics.proposal_parts` — please confirm the real name and that these
   columns exist: `brand, model, quantity, total_sell, subcat, parentcat, state, status,
   dealerid, proposalid, submitted_date, accepteddate`.

## Needed a bit later (for the secure per-vendor login — not required for the first test)

6. How a logged-in user maps to the **vendor/brand** they're allowed to see — i.e. the field
   or service that tells us which brand a given user belongs to. We'll use this to enforce
   that each vendor only ever sees their own scoped data.
