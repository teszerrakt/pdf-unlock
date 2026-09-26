# Privacy guard lives in the test suite

The product's promise is that the file and password never leave the device, but nothing in the code shows or enforces that. So the e2e suite fails on any request to another origin, and a unit test fails if the Content-Security-Policy in `vercel.json` and `public/_headers` drift apart. These tests are part of the product: never loosen them to make a change pass. Adding a third-party origin (analytics, CDN fonts, error reporting) needs a new ADR that supersedes this one first.
