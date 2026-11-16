export default function Card({ children }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-card ring-1 ring-gray-900/5">
      {children}
    </div>
  );
}
