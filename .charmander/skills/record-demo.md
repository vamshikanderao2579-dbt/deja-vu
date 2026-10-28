# Skill: record a demo for instant replay

1. `npm run dev` with `MUSE_ENABLED=true`.
2. Edit the profile's `script` (and `suggestions`) in `data/profiles.json` (Alex, Maria) or `data/private/profiles.json` (Sreenidhi, Vamshi).
3. `node scripts/record-demo.js <profile>`: resets the profile to its starting memory, plays the script live, answers quick checks ✓ Still true. ~$0.05–0.10 per profile.
4. Run it again: every message should take ~1–1.5 s (all replayed). If one is slow, that step changed between runs (learning prompts must stay deterministic: no random ids or clock times in prompts).
5. In the app: Settings → Play demo conversation (or the ▶ button on the welcome screen). Answer cards **✓ Still true** to stay on the recorded path; anything else goes live.
6. For a fully offline recording session: `MUSE_ENABLED=false` (misses show "Not recorded yet").
Any prompt change invalidates recordings: re-record all four (wait a minute between profiles for the rate limit).
