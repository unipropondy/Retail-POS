const fs = require('fs');
const content = fs.readFileSync('d:/POS-Mobile-Ap/App.config', 'utf8');

// Match all <add key="..." value="..." /> handling multi-line or single-line
const regex = /<add\s+key\s*=\s*"([^"]+)"\s+value\s*=\s*"([\s\S]*?)"\s*\/>/g;
let match;
const keys = [];

while ((match = regex.exec(content)) !== null) {
  // Check if inside comment
  const index = match.index;
  const before = content.substring(0, index);
  const lastCommentStart = before.lastIndexOf('<!--');
  const lastCommentEnd = before.lastIndexOf('-->');
  const isCommented = lastCommentStart > lastCommentEnd;

  if (!isCommented) {
    keys.push({
      key: match[1],
      value: match[2].trim()
    });
  }
}

console.log('Total active settings found:', keys.length);
keys.forEach((k, i) => {
  const preview = k.value.length > 50 ? k.value.substring(0, 47) + '...' : k.value;
  console.log(`${i + 1}. [${k.key}] = "${preview}"`);
});

fs.writeFileSync('d:/POS-Mobile-Ap/backend/config/extracted_keys.json', JSON.stringify(keys, null, 2));
