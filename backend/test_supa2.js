const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
  const { data: issues } = await supabase.from('civic_issues').select('*').order('created_at', { ascending: false }).limit(2);
  console.log("Recent Civic Issues:", issues.map(i => ({ id: i.id, title: i.title, root_complaint: i.root_complaint_id, depts: i.departments, types: i.issue_types })));
  
  if (issues && issues.length > 0) {
    const issue = issues[0];
    const { data: tasks } = await supabase.from('civic_tasks').select('*').eq('civic_issue_id', issue.id).order('execution_order', { ascending: true });
    console.log("Tasks for latest issue:", tasks.map(t => ({ id: t.id, dep: t.department, type: t.task_type, order: t.execution_order })));
  }
}
run();
