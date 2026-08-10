# Changelog

This changelog records meaningful completed product, architecture and operational changes from 9 August 2026 onwards. Earlier history remains available in Git and the repository's dated plans and runbooks; it has not been reconstructed as release history.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) where useful. The project does not currently publish numbered releases, so entries are grouped under `Unreleased` until a release convention is adopted.

## Unreleased

### Testing

- Add focused PostgreSQL capacity behaviour coverage and genuine local
  same-slot and daily-cap race gates, preserving PostgreSQL as the final
  booking authority.

### Documentation

- Establish a repository project-memory system with a North Star, dependency-aware roadmap, product requirements, current architecture, decision records, planning standard, agent guidance, reusable prompt library and GitHub contribution templates.
