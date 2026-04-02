export default function Card({ children }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border">
      {children}
    </div>
  );
}