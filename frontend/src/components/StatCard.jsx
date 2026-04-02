export default function StatCard({title,value,icon,onClick}){

 return(
  <div onClick={onClick} className="card cursor-pointer hover:shadow-lg transition">

  <div className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition">

   <div className="flex justify-between">

    <div>

     <p className="text-gray-500 text-sm">
      {title}
     </p>

     <h2 className="text-2xl font-bold mt-2">
      {value}
     </h2>

    </div>

    <div className="bg-indigo-100 p-3 rounded">
      {icon}
    </div>

   </div>

  </div>
  </div>

 )

}