# Python script to read all json files in the working directory.
# Each json file is a list of objects with keys "word", "translation", and "audio".
# first the "translation" key, then the "word" key, then the "audio" key.
import os
import json

def reorder_json_keys(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        data = json.load(file)

    reordered_data = []
    for item in data:
        reordered_item = {
            'translation': item.get('translation'),
            'word': item.get('word'),
            'audio': item.get('audio')
        }
        reordered_data.append(reordered_item)

    # manually write with each dictionary on its own line
    # do not make new lines or spaces between dictionaries
    with open(file_path, 'w', encoding='utf-8') as file:
        file.write('[\n')
        for i, item in enumerate(reordered_data):
            json.dump(item, file, ensure_ascii=False)
            if i < len(reordered_data) - 1:
                file.write(',\n')
        file.write('\n]')

def main():
    for filename in os.listdir('.'):
        print(f'Processing file: {filename}')
        if filename.endswith('.json'):
            reorder_json_keys(filename)
            print(f'Reordered keys in {filename}')
    print('Done!')

if __name__ == '__main__':
    main()
