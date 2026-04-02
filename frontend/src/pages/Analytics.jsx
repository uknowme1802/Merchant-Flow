import {
 LineChart,
 Line,
 XAxis,
 YAxis,
 Tooltip,
 CartesianGrid,
 ResponsiveContainer
} from "recharts";

const data = [
 {day:"Mon", revenue:400},
 {day:"Tue", revenue:900},
 {day:"Wed", revenue:600},
 {day:"Thu", revenue:1100},
 {day:"Fri", revenue:700},
];

export default function Analytics(){

 return(

  <div className="bg-white p-6 rounded-xl shadow">

   <h2 className="text-xl font-bold mb-6">
    Weekly Revenue
   </h2>

   <ResponsiveContainer width="100%" height={300}>

    <LineChart data={data}>

     <CartesianGrid strokeDasharray="3 3"/>

     <XAxis dataKey="day"/>

     <YAxis/>

     <Tooltip/>

     <Line
      type="monotone"
      dataKey="revenue"
      stroke="#6366F1"
      strokeWidth={3}
     />

    </LineChart>

   </ResponsiveContainer>

  </div>

 );
}