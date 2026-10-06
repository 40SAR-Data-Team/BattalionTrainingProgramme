# BattalionTrainingProgramme

Web app for 40SAR company training programmes. A clerk uploads photos or a PDF of the weekly
programme, and the app reads it into a timetable that matches the paper grid. The clerk reviews it
and adds it to each company's Google Calendar. After that, the app and Google Calendar stay in two-way sync.

- **[User guide](docs/user-guide.md)**: signing in, reading and editing the programme, search, uploading, settings.
- **[Developer guide](docs/developer-guide.md)**: setup, layout, tests, settings and secrets, deploying.
- [Architecture](docs/architecture_patterns.md) · [Design](DESIGN.md)

```
bun install
cp frontend/.env.example frontend/.env.local   # fill it in
bun run db:migrate                             # create the tables
bun run dev
bun run test        # unit + integration + e2e
```
