// "Today" for daily counts is the Indian calendar day (Asia/Kolkata, UTC+05:30, no daylight saving).
// Times are stored in UTC; this only finds where the IST day started.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// The UTC instant at which the IST day containing `date` began (midnight IST).
const startOfIstDay = (date = new Date()) => {
    const istMs = date.getTime() + IST_OFFSET_MS;
    return new Date(istMs - (istMs % DAY_MS) - IST_OFFSET_MS);
};

module.exports = { startOfIstDay, IST_OFFSET_MS };
