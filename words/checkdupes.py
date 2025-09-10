# Python script to read all json files in the working directory.
# Each json file is a list of objects with keys "word", "translation", and "audio".
# This file checks for duplicate "word" entries across all json files.
import os
import json

def check_dupes(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        data = json.load(f)
    seen = set()
    for entry in data:
        word = entry.get('word')
        translation = entry.get('translation')
        if word in seen:
            print(f'Duplicate found in {filename}: {word}, {translation}')
        else:
            seen.add(word)

def main():
    for filename in os.listdir('.'):
        if filename.endswith('.json'):
            check_dupes(filename)
            print(f'Done {filename}')
    print('Done!')

if __name__ == '__main__':
    main()
