#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null && pwd)"
cd $SCRIPT_DIR/..

reset () {
  if [ -f .npmignore.orig ]; then
    rm -f .npmignore && mv .npmignore.orig .npmignore
  fi
}

reset

EXCLUDE_RE_PATTERN=""

if [ "$1" == "sandbox" ]; then
  EXCLUDE_RE_PATTERN="sandbox"
elif [ "$1" == "development" ]; then
  EXCLUDE_RE_PATTERN="development"
else
  # Nothing else to do; just leave
  exit 0
fi

# Modify .npmignore file to exclude config files used for the specified environment
cp .npmignore .npmignore.orig && grep -v "^/config/\*$EXCLUDE_RE_PATTERN\*\.json5$" .npmignore.orig > .npmignore && echo "/config/*production*.json5" >> .npmignore
