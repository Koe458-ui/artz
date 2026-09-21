# Ored

Ored is its own project. It has its own Supabase project, its own backend
endpoint and its own deployment. It shares nothing with DigiArtz except the
accounts people sign in with.

## Where things live

| Piece | Where |
|---|---|
| Chat page | `ored/index.html`, `ored/app.js`, `ored/app.css` |
| Backend endpoint | `functions/api/ored.js` |
| Backend helpers | `functions/lib/ored-sb.js`, `functions/lib/ored-http.js` |
| Model, training, learning | `ored/model/` |
| Database | Supabase project `xoauguhlxjozpvukjtro` |
| Checkpoints | Supabase bucket `ored-checkpoints`, private |

Nothing under `ored/` or `functions/*ored*` imports a DigiArtz file, so the whole
of Ored can be lifted onto a branch of its own.

## Sign-in

Ored has no accounts. People sign in with their DigiArtz account, and
`functions/api/ored.js` checks that token against the DigiArtz project before it
writes anything.

A DigiArtz token is signed by the DigiArtz project, so it means nothing to
Ored's project. A browser therefore cannot reach Ored's database at all, and
nothing tries to. Every read and write goes through the backend or the trainer
on the service key.

## Database

Ten tables, all prefixed `ored_`. Row level security is enabled **and forced**
on every one, none of them carries a policy, and `anon` and `authenticated` hold
no grant on any table or on the schema. The service key is the only thing that
reaches this data, and forcing RLS holds the table owner to the same rule.

`user_id`, `reviewed_by` and `approved_by` hold DigiArtz user ids as plain uuid
columns. There is no foreign key, because the accounts they name live in another
project.

## Configuration

`ored/config.js` is generated at deploy and git-ignored, the same way the site's
own `config.js` is. Copy `ored/config.example.js` and fill it in. It holds the
DigiArtz project URL and its publishable key, and never anything secret.

Everything else is an environment variable on the backend:

| Variable | Secret |
|---|---|
| `ORED_AUTH_URL` — DigiArtz project URL, to verify tokens | no |
| `ORED_AUTH_KEY` — DigiArtz publishable key | no |
| `ORED_SB_URL` — Ored project URL | no |
| `ORED_SB_SERVICE_KEY` — Ored service-role key | **yes** |
| `ORED_API_URL` — where `scripts/serve.py` is listening | no |
| `ORED_API_KEY` — shared with the serving process | **yes** |
| `ORED_ALLOWED_ORIGINS` — extra origins allowed to post | no |
| `ORED_SB_CHECKPOINT_BUCKET` — defaults to `ored-checkpoints` | no |

The two secrets are set on the server only. Neither has ever been in this
repository and neither belongs in one.

## Day to day

```bash
cd ored/model
pytest -q

python scripts/train.py
python scripts/serve.py --remote-checkpoints

python scripts/checkpoints.py list
python scripts/checkpoints.py push checkpoints/char_transformer/best.pt --kind best --run-name char_transformer
python scripts/export_learning_dataset.py --tag <tag>
```

`ored/model/README.md` is the long version: how the model works, what it learned,
and why each piece is built the way it is.
