# Private home air quality

The Mac dashboard has a cloud companion at https://home-air-quality.jmwright-045.chatgpt.site. It is owner-private and requires ChatGPT sign-in. A Sites-hosted D1 database stores the measurements, collection log, and sanitized Amazon source values. The Mac logger continues independently.

GitHub Actions polls Amazon at minutes 17 and 47 each hour (UTC). The runner needs no connection to the Mac. The air quality monitor must remain powered, connected to Wi-Fi, and registered to the Amazon account. GitHub can delay or drop scheduled jobs; collection cannot be guaranteed and gaps are visible in history. The UI marks collection overdue after 65 minutes. This is an unofficial Amazon integration and may require sign-in again if Amazon revokes its session.

## Security

Only this sanitized project belongs in the private GitHub repository. Never commit the local `.state` folder, Amazon cookies, a database snapshot, environment files, or secrets. GitHub encrypted Actions secrets hold `SITE_BEARER` (private Site access), `COLLECTOR_TOKEN` (writer authorization), and `SESSION_KEY` (a 256-bit AES-GCM encryption key). Amazon registration/session data is stored as an authenticated encrypted envelope in cloud storage. It is decrypted only in the collector process; it is never sent to dashboard visitors or logged. The collector refreshes the saved Amazon session after five days and persists a newly encrypted copy. Browser users cannot call the session or import endpoints without the writer secret, even after signing into the private Site.

The session grants account access beyond individual monitor readings because Amazon offers no documented monitor-only token. The collector code makes read-only requests to the endpoint list and sensor state. Delete the GitHub secrets or disable the Collect air quality workflow to stop cloud collection. To revoke account access completely, revoke the registered Alexa app/session in Amazon as well.

## Collection and CI

`collect.yml` installs only the small collector dependency set and runs for one collection per job. At 30-minute intervals there are about 1,440–1,488 jobs/month. GitHub rounds each job up to a whole minute, so typical usage starts at that many minutes; longer jobs and other repositories consume more. Account quotas and billing still apply. CI tests and builds source on push/PR; it does not redeploy the Site. Deployments follow the Sites versioning workflow and use the matching source commit.

Readings are deduplicated by monitor, metric and Amazon measurement timestamp, preserving original precision. Stale or unreliable measurement times are kept in the table and excluded from the graph. Existing local data is imported in bounded, retry-safe batches and remains on the Mac. No historical Amazon API series has been imported.

## Commands

- `node --test tests/*.test.mjs collector/*.test.mjs`
- `npx tsc --noEmit`
- `npm run build`
- `node collector/run.mjs` with the three secret variables and `SITE_URL` configured

`collector/bootstrap.mjs` takes JSON on stdin with site access, writer and encryption keys, repository name, and paths to the existing local session and history database. It sets GitHub secrets and imports existing history without writing or printing credentials. Only run on a trusted Mac, against this owner-private Site. Do not pass secrets as shell arguments.
