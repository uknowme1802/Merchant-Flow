export default function StatCard({title,value,icon,onClick}){

 return(
  <div onClick={onClick} className="card cursor-pointer hover:shadow-lg transition">

  <div className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition">

   <div className="flex justify-between items-start">

    <div>

     <p className="text-gray-500 text-sm">
      {title}
     </p>

     <h2 className="text-2xl font-bold mt-2">
      {value}
     </h2>

    </div>

    <div className="bg-indigo-100 text-indigo-600 w-12 h-12 flex items-center justify-center rounded-lg shrink-0">
      {icon}
    </div>

   </div>

  </div>
  </div>

 )

}