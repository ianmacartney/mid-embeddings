#!/bin/bash
if [ ! -x ./convex-local-backend ]; then
    if [ "$(uname)" = "Darwin" ]; then
        if [ "$(uname -m)" = "arm64" ]; then
            pkg=convex-local-backend-aarch64-apple-darwin.zip
        elif [ "$(uname -m)" = "x86_64" ]; then
            pkg=convex-local-backend-x86_64-apple-darwin.zip
        fi
    elif [ "$(uname -m)" = "x86_64" ]; then
        pkg=convex-local-backend-x86_64-unknown-linux-gnu.zip
    fi
    if [ -z "$pkg" ]; then
        echo "Download or build the convex-local-backend: https://github.com/get-convex/convex-backend"
        exit 1
    fi
    curl -L -O "https://github.com/get-convex/convex-backend/releases/latest/download/$pkg"
    unzip "$pkg"
    if [ "$(uname)" = "Darwin" ]; then
        if [ "$(uname -m)" = "arm64" ]; then
            echo "You now need to right click 'convex-local-backend' and select 'Open'"
            read -r -p "Press enter to open this folder"
            open .
            read -r -p "Press enter once you've right-clicked 'convex-local-backend' and clicked 'Open' and answered the dialog"
        fi
    fi
fi
