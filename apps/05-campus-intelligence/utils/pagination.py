"""
Pagination helper functions for consistent paginated API responses.
"""

from flask import request

from utils.schemas import PaginationQuerySchema, get_paginated_response_data, validate_request


class PaginationHelper:
    @staticmethod
    def get_pagination_params():
        params = {
            "page": request.args.get("page", 1, type=int),
            "per_page": request.args.get("per_page", 20, type=int),
            "sort_by": request.args.get("sort_by", "created_at", type=str),
            "sort_order": request.args.get("sort_order", "desc", type=str),
        }

        is_valid, result = validate_request(PaginationQuerySchema, params)
        if not is_valid:
            return None, result

        return result, None

    @staticmethod
    def paginate(items, total, page, per_page):
        return get_paginated_response_data(items, page, per_page, total)

    @staticmethod
    def apply_sort(query, sort_by, sort_order, allowed_fields=None):
        if allowed_fields and sort_by not in allowed_fields:
            sort_by = allowed_fields[0]

        if sort_order.lower() == "asc":
            return query.order_by(sort_by.asc())
        return query.order_by(sort_by.desc())

    @staticmethod
    def sql_paginate(query, page, per_page):
        total = query.count()
        offset = (page - 1) * per_page
        items = query.offset(offset).limit(per_page).all()
        return items, total
