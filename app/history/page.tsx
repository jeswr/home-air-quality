import html from "../../ui/history.html?raw";
const body = html.split("<body>")[1].split("</body>")[0];
export default function History() { return <><link rel="stylesheet" href="/style.css"/><script type="module" src="/history-page.js"/><div dangerouslySetInnerHTML={{__html:body}}/></>; }
