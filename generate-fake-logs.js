const db = require('./database');
const { logActivity } = require('./utils/logger');

const actions = [
    { action: 'LOGIN', details: 'Admin logged in' },
    { action: 'UPDATE_PRODUCT', details: 'Product "Hamburguesa" updated' },
    { action: 'REGISTER', details: 'New merchant registered' },
    { action: 'APPROVE_BUSINESS', details: 'Business "Pizza House" approved' },
    { action: 'CREATE_COUPON', details: 'Coupon SUMMER20 created' }
];

db.serialize(() => {
    console.log('Generating fake audit logs...');
    actions.forEach((a, i) => {
        logActivity(4, a.action, a.details); // Assuming id 4 is admin
    });
    console.log('Fake logs generated successfully.');
});

setTimeout(() => process.exit(), 1000);
