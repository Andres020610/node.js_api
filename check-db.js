const db = require('./database');

db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
    console.log('Total Users:', row.count);
});

db.get("SELECT COUNT(*) as count FROM businesses", (err, row) => {
    console.log('Total Businesses:', row.count);
});

db.get("SELECT COUNT(*) as count FROM coupons", (err, row) => {
    console.log('Total Coupons:', row.count);
});

setTimeout(() => process.exit(), 1000);
