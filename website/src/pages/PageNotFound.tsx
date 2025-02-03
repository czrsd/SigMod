const PageNotFound = () => {
    return <div className="flex flex-col justify-center items-center h-screen gap-6">
        <div className="text-center">
            <h1 className="text-5xl font-bold">404 - Not found</h1>
            <p className="text-lg">Sorry, this page does not exist.</p>
        </div>
        <a className="text-lg" href="/">Back to homepage</a>
    </div>
};

export default PageNotFound