import TemplateA from './TemplateA'
import TemplateB from './TemplateB'
import TemplateC from './TemplateC'
import TemplateD from './TemplateD'
import TemplateE from './TemplateE'

const TEMPLATES = {
  'template-a': TemplateA,
  'template-b': TemplateB,
  'template-c': TemplateC,
  'template-d': TemplateD,
  'template-e': TemplateE,
}

export default function TemplateRouter(props) {
  const templateId = props.site?.template_id || 'template-a'
  const Template = TEMPLATES[templateId] || TemplateA
  return <Template {...props} />
}
