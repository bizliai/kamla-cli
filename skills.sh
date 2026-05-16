#!/bin/bash

# Kamla Skills Installation Script
# This script helps you install common skills for your Kamla agents.

set -e

SKILLS_DIR="$HOME/.kamla/skills"
mkdir -p "$SKILLS_DIR"

echo "Kamla Skills Installer"
echo "======================"

install_local_skill() {
    local skill_path=$1
    local name=$2
    echo "Installing local skill: $name..."
    mkdir -p "$SKILLS_DIR/$name"
    cp -r "$skill_path"/* "$SKILLS_DIR/$name/"
    echo "Success!"
}

# Example: Install the weather skill from the examples directory
if [ -d "examples/skills/weather" ]; then
    install_local_skill "examples/skills/weather" "weather"
fi

echo ""
echo "Skills installed successfully!"
echo "You can now use them in Kamla by typing '/skill list' in the chat."
