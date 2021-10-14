#!/bin/bash

if [[ ! -z "${TRAVIS_TAG}" ]]; then
  # Only set the version for tags
  npm run lerna -- version ${TRAVIS_TAG} --no-git-tag-version --exact -y
fi
