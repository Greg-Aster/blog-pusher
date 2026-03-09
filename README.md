# BlogPusher

BlogPusher is a mobile app for editing and publishing Markdown posts from Git repositories.

It is built for a repo-first blogging workflow:

- browse posts that already exist in a GitHub or GitLab repo
- open a post on your phone and edit it locally
- preview Markdown before publishing
- attach images and upload them to the site's `public/blog-images` folder
- queue changes and push them back to the repository
- create new local posts and publish them when ready

## What It Is For

BlogPusher is aimed at static-site blogging from a mobile device.

Instead of copying files between apps, the app keeps the editing and publishing flow in one place:

- repository browsing
- Markdown editing
- frontmatter preservation
- image insertion
- queued publishing
- GitHub/GitLab push

## Current Features

- Browse repo posts by site
- Open existing remote posts in the editor
- Create new posts locally
- Resume local drafts later
- Manual `Light / Dark / System` appearance setting
- Markdown preview tab
- Diff tab for comparing edits
- Autosave to local device storage
- Push queue for staged uploads
- GitHub and GitLab support
- Image picking from camera or library
- Upload images into the correct site `public/blog-images` folder
- Overwrite confirmation when a queued edit matches an existing repo post slug

## Editing Model

BlogPusher is a Markdown-source editor, not a full desktop WYSIWYG editor.

It includes:

- live Markdown-aware editing
- insert helpers for headings, callouts, code fences, tables, and image blocks
- document outline navigation
- internal link helpers
- draft history snapshots

The app is designed around writing Markdown directly, then using the preview tab to see rendered output.

## Supported Workflow

1. Choose a site and browse repository posts.
2. Open a post or create a new one.
3. Edit locally on the device.
4. Add images if needed.
5. Save to the queue.
6. Push changes to GitHub or GitLab.
7. Let the static site rebuild from the repo update.

## Local Drafts And Queue

- Drafts autosave locally on the device while you edit.
- Queue items remain stored locally until you push or remove them.
- Existing repo posts keep their linked remote path so pushes update the correct file.
- If a queued item matches an existing slug but has lost its remote identity, the app asks before overwriting.

## Tech Stack

- Expo
- React Native
- React Navigation
- AsyncStorage
- `@ronradtke/react-native-markdown-display`
- `@expensify/react-native-live-markdown`

## Run Locally

```bash
npm install
npm start
```

Android local build:

```bash
npx expo run:android
```

## Cloud Builds

This repo is configured for Expo EAS.

- development work happens on `claude/markdown-editor-frontmatter-XfUim`
- release builds are triggered from `main`
- pushing to `main` starts the configured Expo Android preview build workflow

Manual cloud build:

```bash
npx eas-cli@latest build --platform android --profile preview
```

## Configuration

Set repository credentials and site paths in the app Settings screen:

- GitHub token, owner, repo, branch
- GitLab token, project, branch
- site content paths for each blog

These settings control:

- where posts are loaded from
- where Markdown files are pushed
- where images are uploaded

## Project Status

BlogPusher is already usable for mobile repo-based blog editing and publishing, but it is still an actively evolving tool. The strongest current focus is improving the mobile editing experience while keeping the Git-based publishing flow reliable.
