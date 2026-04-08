const  errorMiddleware = (err, req, res, next) => {
    console.error("🔥Error occured!", err);

    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Internal Server error"
    })
}

export default errorMiddleware;