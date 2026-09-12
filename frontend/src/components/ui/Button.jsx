export default function Button({ children, onClick, className, disabled=false }) {

  const classes = className
  ? `transition disabled:opacity-50 disabled:cursor-not-allowed ${className}`
  : "bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed";
  
  return (
    <button
      onClick={onClick}
      disabled= {disabled}
      className={classes}>
      {children}
    </button>
  )
}