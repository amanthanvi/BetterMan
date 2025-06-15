#!/bin/bash

# Script to add all Next.js files to git

echo "Adding Next.js files to git..."

# Add lib directory and all its contents
git add lib/

# Add components directory and all its contents
git add components/

# Add app directory and all its contents
git add app/

# Add data directory and all its contents
git add data/

# Add hooks directory and all its contents
git add hooks/

# Add modified files
git add .gitignore
git add vercel.json
git add package.json

# Add prebuild.js file
git add prebuild.js

echo "Files added to git successfully!"
echo "Run 'git status' to see the staged files"