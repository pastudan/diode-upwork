#!/bin/bash

# Variables
URL="http://157.131.129.57/videos/sample_turtle_hevc.mkv"
SPARSE_FILE="sparse.mkv"
TEMP_HEADER="header.mkv"
TEMP_FOOTER="footer.mkv"
HEADER_SIZE="50000"  # Size of the header to download
FOOTER_SIZE="50000"  # Size of the footer to download

# Get the total size of the original file
FILE_SIZE=$(curl -sI "$URL" | grep -i Content-Length | awk '{print $2}' | tr -d '\r')
echo "File size: $FILE_SIZE"

# Calculate the start of the footer
FOOTER_START=$((FILE_SIZE - FOOTER_SIZE))
echo "Footer start: $FOOTER_START"

# Create a sparse file of the exact size of the original
truncate -s "$FILE_SIZE" "$SPARSE_FILE"

# Download the header
curl -r 0-$(($HEADER_SIZE - 1)) -o "$TEMP_HEADER" "$URL"

# Download the footer
curl -r $FOOTER_START-$(($FILE_SIZE - 1)) -o "$TEMP_FOOTER" "$URL"

# Write the header and footer to the sparse file
dd if="$TEMP_HEADER" of="$SPARSE_FILE" conv=notrunc bs=1 count=$HEADER_SIZE
dd if="$TEMP_FOOTER" of="$SPARSE_FILE" conv=notrunc bs=1 seek=$FOOTER_START

# Clean up temporary files
rm "$TEMP_HEADER" "$TEMP_FOOTER"

# Echo completion
echo "Sparse file created with header and footer in place. File: $SPARSE_FILE"

mkvextract "$SPARSE_FILE" cues 0:cues.txt