import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { getProductIcon } from '@/lib/productIcons'

export function ProductIcon({ icon, className = 'size-4', ...props }) {
  return <FontAwesomeIcon icon={getProductIcon(icon)} className={className} {...props} />
}
