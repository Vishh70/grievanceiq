const msg1 = "Could not find the 'ml_labels' column of 'complaints' in the schema cache";
const msg2 = 'column "ml_labels" of relation "complaints" does not exist';
const msg3 = "Could not find the 'similar_group_id' column of 'complaints'";

function extractCol(msg) {
    if (msg.includes('does not exist')) {
        const m = msg.match(/column "(.*?)" of relation/);
        return m ? m[1] : null;
    }
    if (msg.includes('Could not find the')) {
        const m = msg.match(/find the '(.*?)' column/);
        return m ? m[1] : null;
    }
    return null;
}

console.log(extractCol(msg1));
console.log(extractCol(msg2));
console.log(extractCol(msg3));
