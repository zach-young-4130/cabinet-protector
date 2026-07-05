.PHONY: dev

dev:
	@trap 'kill 0' INT TERM EXIT; \
	( cd parent-protech-api && bundle exec rails server ) & \
	( cd ppt-web && npm start ) & \
	wait