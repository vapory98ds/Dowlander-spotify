const NodeID3 = require('node-id3');
const fs = require('fs');

const file = 'test_tag.mp3';
fs.writeFileSync(file, 'dummy content');

try {
    console.log('Testing null APIC...');
    const tags = {
        title: 'Test',
        artist: 'Artist',
        APIC: null
    };

    // NodeID3.write returns buffer or true/false, or throws?
    const success = NodeID3.write(tags, file);
    console.log('Success:', success);

} catch (e) {
    console.error('NodeID3 Error:', e);
} finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
}
