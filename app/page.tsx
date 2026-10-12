import html from "../ui/index.html?raw";
const body = html.split("<body>")[1].split("</body>")[0];
export default function Home() { return <><link rel="stylesheet" href="/style.css"/><script src="/app.js" defer/><div dangerouslySetInnerHTML={{__html:body}}/></>; }
