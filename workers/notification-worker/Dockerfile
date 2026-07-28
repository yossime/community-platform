FROM public.ecr.aws/lambda/nodejs:20
COPY dist/ ${LAMBDA_TASK_ROOT}/
CMD ["handler.handler"]
