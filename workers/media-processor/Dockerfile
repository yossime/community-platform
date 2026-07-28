FROM public.ecr.aws/lambda/nodejs:20
# Sharp Lambda layer handles native deps
COPY dist/ ${LAMBDA_TASK_ROOT}/
CMD ["handler.handler"]
