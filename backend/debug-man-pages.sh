#!/bin/bash
# Debug script to check man page availability

echo "=== Checking Man Page Installation ==="
echo ""

echo "1. Checking man directories:"
for dir in /usr/share/man /usr/local/share/man /usr/local/man; do
    if [ -d "$dir" ]; then
        echo "   ✓ $dir exists"
        echo "     Sections: $(ls -d $dir/man* 2>/dev/null | wc -l)"
    else
        echo "   ✗ $dir does not exist"
    fi
done
echo ""

echo "2. Checking man1 directory contents:"
if [ -d "/usr/share/man/man1" ]; then
    echo "   Total files: $(ls /usr/share/man/man1/*.gz 2>/dev/null | wc -l)"
    echo "   Sample files:"
    ls /usr/share/man/man1/*.1.gz 2>/dev/null | head -10 | xargs -I {} basename {}
else
    echo "   ✗ /usr/share/man/man1 does not exist"
fi
echo ""

echo "3. Checking for specific commands:"
for cmd in ls grep curl git tar ps cat echo mkdir cp mv rm; do
    # Try to find the man page file directly
    man_file=$(find /usr/share/man -name "${cmd}.1*" 2>/dev/null | head -1)
    if [ -n "$man_file" ]; then
        echo "   ✓ $cmd: $man_file"
    else
        # Try using man -w
        man_path=$(man -w $cmd 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo "   ✓ $cmd: $man_path"
        else
            echo "   ✗ $cmd: not found"
        fi
    fi
done
echo ""

echo "4. Checking installed packages:"
dpkg -l | grep -E "^ii.*(coreutils|grep|curl|git|tar|procps)" | awk '{print "   " $2 ": " $3}'
echo ""

echo "5. Man database status:"
mandb 2>&1 | head -5
echo ""

echo "6. Total man pages by section:"
for i in 1 2 3 4 5 6 7 8; do
    count=$(find /usr/share/man -name "*.${i}.gz" 2>/dev/null | wc -l)
    if [ $count -gt 0 ]; then
        echo "   Section $i: $count pages"
    fi
done