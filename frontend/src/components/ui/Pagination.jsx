// Previous / Next with the page number. Pass pageSize and setPageSize to also show the
// "rows per page" choice, and total to show the row count.
const step = "px-4 py-2 rounded-xl bg-white text-sm text-gray-700 ring-1 ring-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed";

export default function Pagination({page, setPage, totalPages, pageSize, setPageSize, total, sizes = [10, 25, 50]}){
    const pages = Math.max(totalPages || 1, 1);

    return(
        <div className="flex flex-wrap justify-between items-center gap-3 mt-5">
            <button
            disabled={page<=1}
            onClick={()=>setPage(page-1)}
            className={step}
            >
                Previous
            </button>

            <div className="flex items-center gap-4 text-sm text-gray-600">
                {setPageSize && (
                    <label className="flex items-center gap-2">
                        Rows per page
                        <select
                        value={pageSize}
                        onChange={(e)=>setPageSize(Number(e.target.value))}
                        className="py-1 pl-2 pr-1 rounded-lg bg-white ring-1 ring-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                            {sizes.map((size)=><option key={size} value={size}>{size}</option>)}
                        </select>
                    </label>
                )}

                <span>
                    Page <span className="font-medium text-gray-900">{page}</span> of {pages}{typeof total === "number" ? ` (${total} total)` : ""}
                </span>
            </div>

            <button
            disabled={page>=pages}
            onClick={()=>setPage(page+1)}
            className={step}
            >
                Next
            </button>
        </div>
    );
}
