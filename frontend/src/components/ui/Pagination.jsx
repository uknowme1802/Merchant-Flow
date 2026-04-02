export default function Pagination({page, setPage, totalPages}){
    return(
        <div className="flex justify-between items-center mt-4">
            <button
            disabled={page===1}
            onClick={()=>setPage(page-1)}
            className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
            >
                Previous
            </button>

            <span className="text-sm">
                Page {page} of {totalPages}
            </span>

            <button
            disabled={page===totalPages}
            onClick={()=>setPage(page+1)}
            className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
            >
                Next
            </button>
        </div>
    );
}