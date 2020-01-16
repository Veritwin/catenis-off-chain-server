#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null && pwd)"
cd $SCRIPT_DIR/..

reset () {
  if [ -f .npmignore.orig ]; then
    rm -f .npmignore && mv .npmignore.orig .npmignore
  fi
}

reset

if [ "$1" == "reset" ]; then
  # Nothing else to do; just leave
  exit 0
fi

# Modify .npmignore file to exclude config files used for development
cp .npmignore .npmignore.orig && grep -v "^/config/\*development\*\.json5$" .npmignore.orig > .npmignore && echo "/config/*sandbox*.json5" >> .npmignore
