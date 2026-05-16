#!/bin/bash
CITY=$1
if [ -z "$CITY" ]; then
  echo "Error: City name is required"
  exit 1
fi

echo "The weather in $CITY is currently sunny with a temperature of 25°C."
