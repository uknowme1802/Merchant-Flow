import axios from "axios";

// For pages anyone can open without logging in (the customer checkout). Unlike services/api.js it
// sends no login token and has no interceptors, so an error here can never sign someone out,
// redirect them or pop up a toast; the page decides how to show each error.
const publicApi = axios.create({
    baseURL: import.meta.env.VITE_API_URL
});

export default publicApi;
