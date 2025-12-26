import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { SuccessResponseRto } from '@shared/response.rto';
type ApiSuccessResponseOptions = {
	isArray?: boolean;
};

export const ApiSuccessResponse = <TModel extends Type<any>>(model: TModel, options: ApiSuccessResponseOptions = {}) => {
	const { isArray = false } = options;

	return applyDecorators(
		ApiExtraModels(SuccessResponseRto, model),
		ApiOkResponse({
			schema: {
				allOf: [
					{ $ref: getSchemaPath(SuccessResponseRto) },
					{
						properties: {
							data: isArray
								? {
										type: 'array',
										items: { $ref: getSchemaPath(model) },
									}
								: { $ref: getSchemaPath(model) },
						},
					},
				],
			},
		}),
	);
};

// export const ApiSuccessResponse = <TModel extends Type<any>>(model: TModel) => {
// 	return applyDecorators(
// 		ApiExtraModels(SuccessResponseRto, model),
// 		ApiOkResponse({
// 			schema: {
// 				allOf: [
// 					{ $ref: getSchemaPath(SuccessResponseRto) },
// 					{
// 						properties: {
// 							data: { $ref: getSchemaPath(model) },
// 						},
// 					},
// 				],
// 			},
// 		}),
// 	);
// };
