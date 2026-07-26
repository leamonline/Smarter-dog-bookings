#!/usr/bin/env bash

file_contains_fixed_string() {
  grep -F -q -e "$1" "$2"
}
