#!/bin/bash

if [[ ! -z "${TRAVIS_TAG}" ]]; then
  # Only set the version for tags
  npm version ${TRAVIS_TAG} --allow-same-version --no-git-tag-version
fi
