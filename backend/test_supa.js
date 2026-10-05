const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
  const { data: comp } = await supabase.from('complaints').select('id, similar_group_id, title').eq('id', '18137284-2c0a-4666-8df8-2e9da49ade2e').single();
  console.log("Complaint:", comp);
  
  if (comp && comp.similar_group_id) {
    const { data: issue } = await supabase.from('civic_issues').select('*').eq('id', comp.similar_group_id).single();
    console.log("Civic Issue:", issue);
    
    const { data: tasks } = await supabase.from('civic_tasks').select('*').eq('civic_issue_id', issue.id).order('execution_order', { ascending: true });
    console.log("Tasks:", tasks.map(t => ({ id: t.id, dep: t.department, type: t.task_type, order: t.execution_order, status: t.status })));
  }
}
run();
