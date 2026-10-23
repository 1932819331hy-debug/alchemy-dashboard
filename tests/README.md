# Simulation form checks

Run `python -m unittest discover -s tests -v` with Python 3.10+ and Node.js
available on PATH. No test packages need installing.

The Python tests parse the actual template to check form ownership, field names,
defaults, file encoding, and which controls belong to the fresh-only fieldset.
The Node test executes the actual inline script with narrow DOM, fetch, and
FormData doubles. It checks generator/parent switching, option population,
submission wiring, repeated fresh/seeded/fresh submissions, and empty/failed
parent lists.

These are template-contract and script-unit tests. They do not validate browser
rendering, native constraint validation, real FormData/file serialization, Jinja
inheritance, Flask routes, SQLite persistence, or the Rust engine.

To run against a separate template snapshot, set `SIMULATION_TEMPLATE` to its
absolute path. This supports regression and negative-control checks without
modifying the working template.
